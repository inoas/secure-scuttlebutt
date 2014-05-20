var pl = require('pull-level')
var pull = require('pull-stream')
var Feed = require('./feed')
var para = require('pull-paramap')
var Blake2s = require('blake2s')
var varint = require('varstruct').varint
var codec = require('./codec')

var pswitch = require('pull-switch')
var u = require('./util')
var first = new Buffer([2])
var last = new Buffer(41) //1 + 8 + 32

last.fill(255)
last[0] = 2
var firstLatest = new Buffer([3])
var lastLatest = new Buffer(33)
lastLatest.fill(255)
lastLatest[0] = 3

var bsum = u.bsum

/*
How to representing following in the database?

you could do a "soft-follow" by just writing out the
current value into the "latest" section, this means
those will be requested when you follow someone.

That will get follow working, but really, I want you to post a message
that says you are following someone - so that other node's
know they can replicate from you.


*/

module.exports = function (db, keys) {

  var feeds = {}
  var sbs
  return sbs = {
    feed: function (id, keys) {
      if('string' === typeof id)
        id = new Buffer(id, 'hex')
      if(id.public)
        keys = id, id = bsum(keys.public)
      return Feed(db, id, keys)
    },
    latest: function () {
      return pull(
        pl.read(db, {gte: firstLatest, lte: lastLatest}),
        pull.map(function (data) {
          return {
            key: codec.LatestKey.decode(data.key).id,
            value: varint.decode(data.value)
          }
        })
      )
    },
    createFeedStream: function (opts) {
      opts = opts || {}
      opts.keys = false
      return pull(
        pl.read(db, {gte: first, lte: last, keys: false}),
        para(function (key, cb) {
          db.get(key, cb)
        }),
        Feed.decodeStream()
      )
    },
    createReadStream: function (opts) {
      return this.createFeedStream()
    },
    createWriteStream: function (cb) {
      var cbs = u.groups(cb)
      return pswitch(function (msg) {
         return msg.author.toString('hex')
        }, function (msg) {
            var key = msg.author.toString('hex')
            feeds[key] = feeds[key] || sbs.feed(msg.author)
            return feeds[key].createWriteStream(cbs())
        })
    }
  }

}
