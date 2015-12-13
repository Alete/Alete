var express  = require('express'),
    Follow = require('../models/Follow'),
    Activity = require('../models/Activity');

module.exports = (function() {
    var app = express.Router();

    function ensureAuthenticated(req, res, next) {
        if(req.isAuthenticated()) {
            return next();
        }
        res.redirect('/signin');
    }

    function limitActivity(req, res, next) {
        var midnight = (new Date()).setHours(0, 0, 0, 0),
            now = new Date();
        Activity.count({
            owner: req.user._id,
            date: {
                $gte: midnight,
                $lt: now
            }
        }).exec(function(err, count){
            if(err) { return next(err); }
            if(count < 250){
                return next();
            } else {
                return next('Too many posts!');
            }
        });
    }

    app.get('/', ensureAuthenticated, function(req, res, next){
        if(!res.locals.subDomain){
            Follow.find({
                follower: req.user._id
            }).exec(function(err, following){
                // This will give us the people the signed in user follows
                // We need to get it to an array to use with $in
                // We add the current user otherwise they're missing their own posts
                var activityNeeded = [req.user._id];
                for(var i = 0; i < following.length; i++){
                    activityNeeded.push(following[i].followee);
                }
                Activity.find({
                    owner: {
                        $in: activityNeeded
                    },
                    $or: [
                        {
                            type: 'post'
                        },
                        {
                            type: 'reflow'
                        }
                    ]
                }).sort({
                    _id: 'desc'
                }).limit(20).populate('content.post').exec(function(err, activityFeed){
                    // This is the activity of all of the people the signed in user follows
                    res.render('index', {
                        activityFeed: activityFeed
                    });
                });
            });
        } else {
            next();
        }
    });

    app.get('/user', ensureAuthenticated, function(req, res, next){
        if(!res.locals.subDomain){
            res.send({
                user: req.user
            });
        } else {
            next();
        }
    });

    app.get('/following', ensureAuthenticated, function(req, res, next){
        if(!res.locals.subDomain){
            Follow.find({
                follower: req.user._id
            }).exec(function(err, following){
                res.send(following);
            });
        } else {
            next();
        }
    });

    app.get('/follow/:_id', ensureAuthenticated, function(req, res, next){
        if(!res.locals.subDomain){
            var follow = new Follow({
                followee: req.params._id,
                follower: req.user._id
            });
            follow.save(function(err, follow){
                res.send(follow);
            });
        } else {
            next();
        }
    });

    app.get('/activity/post', ensureAuthenticated, limitActivity, function(req, res, next){
        if(!res.locals.subDomain){
            var activity = new Activity({
                owner: req.user._id,
                type: 'post',
                content: {
                    images: [
                        'https://i.imgur.com/FXNQH7v.jpg',
                        'https://i.imgur.com/shFGwVY.jpg',
                        'https://i.imgur.com/p77rGBL.gif'
                    ],
                    body: 'This is the post body',
                    notes: 1
                }
            });
            activity.save(function(err, post){
                res.send({
                    post: post
                });
            });
        } else {
            next();
        }
    });

    app.post('/activity/reflow/', ensureAuthenticated, limitActivity, function(req, res, next){
        if(!res.locals.subDomain){
            var activity = new Activity({
                owner: req.user._id,
                type: 'reflow',
                content: {
                    post: req.body._id
                }
            });
            activity.save(function(err, reflow){
                Activity.update({
                    _id: req.body._id,
                    type: 'post'
                },{
                    $inc: {
                        'content.notes': 1
                    }
                }).exec(function(err){
                    if(err) { next(err); }
                    res.send({
                        reflow: reflow
                    });
                });
            });
        } else {
            next();
        }
    });

    app.post('/activity/heart/', ensureAuthenticated, limitActivity, function(req, res, next){
        if(!res.locals.subDomain){
            Activity.findOne({
                'content.post': req.body._id,
                type: 'heart'
            }).exec(function(err, heart){
                if(err) { next(err); }
                if(!heart){
                    var activity = new Activity({
                        owner: req.user._id,
                        type: 'heart',
                        content: {
                            post: req.body._id
                        }
                    });
                    activity.save(function(err, heart){
                        if(err) { next(err); }
                        res.send({
                            heart: heart
                        });
                    });
                } else {
                    res.send({
                        heart: heart
                    });
                }
            });
        } else {
            next();
        }
    });

    return app;
})();
