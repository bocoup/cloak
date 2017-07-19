/* jshint node:true */

var _ = require('lodash');
var debug = require('debug')('cloak:main');
var uuid = require('node-uuid');

module.exports = Room;

function Room(cloak, nameArg, sizeArg, roomEventsArg, isLobby, minRoomMembers) {
  this.cloak = cloak;
  this._roomEvents = roomEventsArg || {};
  this.isLobby = isLobby;
  this.minRoomMembers = minRoomMembers;
  this.id = uuid.v4();
  this.name = nameArg;
  this.members = [];
  this.size = sizeArg;
  this.created = new Date().getTime();
  this.data = {};
  this._emitEvent('init', this);
  this._lastEmpty = new Date().getTime();
}

Room.prototype._pulse = function() {
  this._emitEvent('pulse', this);
};

// return true if successful
Room.prototype.addMember = function(user) {
  if (!this._shouldAllowUser(user)) {
    return false;
  }
  user.leaveRoom();
  this.members.push(user);
  user.room = this;
  if (this.minRoomMembers !== null &&
      this.members.length >= this.minRoomMembers) {
    this._hasReachedMin = true;
  }
  this._emitEvent('newMember', this, user);
  this._serverMessageMembers(this.isLobby ? 'lobbyMemberJoined' : 'roomMemberJoined', _.pick(user, 'id', 'name'));
  user._serverMessage('joinedRoom', _.pick(this, 'name'));
  return true;
};

Room.prototype.removeMember = function(user) {
  if (user.room !== this) {
    return;
  }
  this.members = _.without(this.members, user);
  delete user.room;
  if (this.members.length < 1) {
    this._lastEmpty = new Date().getTime();
  }
  if (!this.isLobby && this._autoJoinLobby) {
    this._lobby.addMember(user);
  }
  this._emitEvent('memberLeaves', this, user);
  this._serverMessageMembers(this.isLobby ? 'lobbyMemberLeft' : 'roomMemberLeft', _.pick(user, 'id', 'name'));
  user._serverMessage('leftRoom', _.pick(this, 'name'));
};

Room.prototype.age = function() {
  return new Date().getTime() - this.created;
};

Room.prototype.getMembers = function(json) {
  if (json) {
    return _.invoke(this.members, '_userData');
  }
  else {
    return _.values(this.members);
  }
};

Room.prototype.messageMembers = function(name, arg) {
  _.forEach(this.members, function(member) {
    member.message(name, arg);
  }.bind(this));
};

Room.prototype.delete = function() {
  this._closing = true;
  _.forEach(this.members, function(user) {
    user.leaveRoom();
  });
  this._emitEvent('close', this);
  this.cloak._deleteRoom(this);
};

Room.prototype._serverMessageMembers = function(name, arg) {
  _.forEach(this.members, function(member) {
    member._serverMessage(name, arg);
  }.bind(this));
};

Room.prototype._shouldAllowUser = function(user) {
  if (this._roomEvents.shouldAllowUser) {
    return this._emitEvent('shouldAllowUser', this, user);
  } else {
    return true;
  }
};

Room.prototype._emitEvent = function(event, context, args) {
  var roomEvent = this._roomEvents[event];
  if (!_.isUndefined(args) && !Array.isArray(args)) {
    args = [args];
  }
  if (!!roomEvent) {
    return roomEvent.apply(context, args);
  }
};

Room.prototype._roomData = function() {
  return {
    id: this.id,
    name: this.name,
    users: _.map(this.members, function(user) {
      return user._userData();
    }),
    size: this.size
  };
};
