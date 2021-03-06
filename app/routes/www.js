var express = require('express'),
    mongoose = require('mongoose'),
    toobusy = require('toobusy-js'),
    Follow = require('../models/Follow'),
    User = require('../models/User'),
    Activity = require('../models/Activity'),
    AccessToken = require('../models/AccessToken'),
    Blog = require('../models/Blog');

module.exports = (function() {
    var app = express.Router();

    function ensureAuthenticated(req, res, next) {
        if(req.isAuthenticated()) {
            return next();
        } else {
            res.render('countDown');
        }
    }

    function ensureAdmin(req, res, next) {
        if(req.user.isAdmin) {
            return next();
        }
        return next('route');
    }

    function limitActivity(req, res, next) {
        var midnight = (new Date()).setHours(0, 0, 0, 0),
            now = new Date();
        Activity.count({
            blog: req.user._id,
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

    function ensureMainSite(req, res, next) {
        if(!Object.keys(res.locals.blog).length){
            next();
        } else {
            next('route');
        }
    }

    // The absolute first piece of middle-ware we would register, to block requests
    // before we spend any time on them.
    app.use(function(req, res, next) {
        // check if we're toobusy() - note, this call is extremely fast, and returns
        // state that is cached at a fixed interval
        if (toobusy()){
            res.status(503).render('http/500', {
                error: 'I\'m busy right now, sorry.'
            });
        } else {
            next();
        }
    });

    app.get('/', ensureMainSite, ensureAuthenticated, function(req, res){
        var skip = (req.query.page > 0 ? (req.query.page-1) * 20 : 0);
        Follow.find({
            follower: req.user.blogs[0]._id
        }).exec(function(err, following){
            // This will give us the people the signed in user follows
            // We need to get it to an array to use with $in
            // We add the current user's blogs otherwise they're missing their own posts
            var activityNeeded = [],
                i = 0;
            for(i = 0; i < req.user.blogs.length; i++){
                activityNeeded.push(req.user.blogs[i]._id);
            }
            for(i = 0; i < following.length; i++){
                activityNeeded.push(following[i].followee);
            }
            Activity.find({
                blog: {
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
            }).skip(skip).limit(20).populate('content.post').exec(function(err, activityFeed){
                // This is the activity of all of the people the signed in user follows
                res.render('index', {
                    activityFeed: activityFeed
                });
            });
        });
    });

    app.get('/blog/:url', ensureMainSite, ensureAuthenticated, function(req, res, next){
        var skip = (req.query.page > 0 ? (req.query.page-1) * 20 : 0);
        Blog.findOne({
            url: req.params.url
        }).exec(function(err, blog){
            if(err) { next(err); }
            if(blog) {
                Activity.find({
                    blog: blog._id,
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
                }).skip(skip).limit(20).populate('content.post').exec(function(err, activityFeed){
                    // This is the activity of the blog requested
                    // @TODO this should be replaced with a custom page instead of using index's template
                    res.render('index', {
                        activityFeed: activityFeed
                    });
                });
            } else {
                next('Blog doesn\'t exist');
            }
        });
    });

    app.get('/blog/:url/activity', ensureMainSite, ensureAuthenticated, function(req, res, next){
        var skip = (req.query.page > 0 ? (req.query.page-1) * 20 : 0);
        Blog.findOne({
            url: req.params.url
        }).exec(function(err, blog){
            if(err) { next(err); }
            if(blog) {
                Activity.aggregate([
                    {
                        $match: {
                            blog: mongoose.Types.ObjectId(blog._id)
                        }
                    },
                    {
                        $group: {
                            _id: {
                                year: {
                                    $year: "$date"
                                },
                                month:{
                                    $month: "$date"
                                },
                                day: {
                                    $dayOfMonth: "$date"
                                }
                            },
                            notes: {
                                $sum: 1
                            }
                        }
                    },
                    {
                        $sort: {
                            _id: 1
                        }
                    }
                ]).skip(skip).limit(20).exec(function(err, notes){
                    if(err) { next(err); }
                    // This is the activity of the blog requested
                    // @TODO this should be replaced with a custom page instead of using index's template
                    res.render('activity', {
                        notes: notes
                    });
                });
            } else {
                next('Blog doesn\'t exist');
            }
        });
    });

    app.get('/user', ensureMainSite, ensureAuthenticated, function(req, res){
        res.send({
            user: {
                _id: req.user._id,
                email: req.user.email,
                blogs: req.user.blogs
            }
        });
    });

    app.get('/blogs', ensureMainSite, ensureAuthenticated, function(req, res){
        res.send({
            blogs: req.user.blogs
        });
    });

    app.get('/following/:blogUrl', ensureMainSite, ensureAuthenticated, function(req, res, next){
        Blog.findOne({
            url: req.params.blogUrl
        }).exec(function(err, blog){
            if(err) { next(err); }
            if(blog) {
                Follow.find({
                    follower: blog.id
                }).exec(function(err, following){
                    if(err) { next(err); }
                    res.send({
                        total: following.length,
                        following: following
                    });
                });
            }
        });
    });

    app.get('/followers/:blogUrl', ensureMainSite, ensureAuthenticated, function(req, res, next){
        Blog.findOne({
            url: req.params.blogUrl
        }).exec(function(err, blog){
            if(err) { next(err); }
            if(blog) {
                Follow.find({
                    followee: blog.id
                }).exec(function(err, followers){
                    if(err) { next(err); }
                    res.send({
                        total: followers.length,
                        followers: followers
                    });
                });
            }
        });
    });

    app.get('/follow/:url', ensureMainSite, ensureAuthenticated, function(req, res, next){
        Blog.findOne({
            url: req.params.url
        }).exec(function(err, blog){
            if(err) { next(err); }
            if(blog){
                var follow = new Follow({
                    followee: blog._id,
                    follower: req.user.blogs[0]._id
                });
                follow.save(function(err, follow){
                    res.send(follow);
                });
            } else {
                res.send('That blog doesn\'t exist');
            }
        });
    });

    // upload.single('file'),
    // ^ that needs to be added for image uploading, for now we only support text!
    app.post('/activity/post', ensureMainSite, ensureAuthenticated, limitActivity, function(req, res, next){
        var activity = new Activity({
            blog: req.user.blogs[0].id, // @TODO This should be the current blog you're using
            type: 'post',
            content: {
                body: req.body.text,
                notes: 1
            }
        });
        activity.save(function(err, post){
            if(err) { next(err); }
            if(post){
                res.redirect('/');
            } else {
                next('Post couldn\'t be saved at this time.');
            }
        });
    });

    app.post('/activity/reflow', ensureMainSite, ensureAuthenticated, limitActivity, function(req, res, next){
        var activity = new Activity({
            blog: req.user.blogs[0].id, // @TODO This should be the current blog you're using
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
    });

    app.post('/activity/heart', ensureMainSite, ensureAuthenticated, limitActivity, function(req, res, next){
        Activity.findOne({
            'content.post': req.body._id,
            type: 'heart'
        }).exec(function(err, heart){
            if(err) { next(err); }
            if(!heart){
                var activity = new Activity({
                    blog: req.user.blogs[0].id, // @TODO This should be the current blog you're using
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
    });

    app.get('/tokenGen', ensureMainSite, ensureAuthenticated, ensureAdmin, function(req, res, next){
        var accessToken = new AccessToken();
        accessToken.save(function(err, accessToken){
            if(err) { next(err); }
            res.send({
                accessToken: accessToken
            });
        });
    });

    app.get('/unusedTokens', ensureMainSite, ensureAuthenticated, ensureAdmin, function(req, res, next){
        AccessToken.find({
            used: false
        }).select('_id').lean().limit(20).exec(function(err, accessTokens){
            if(err) { next(err); }
            res.send({
                accessTokens: accessTokens
            });
        });
    });

    app.get('/pleaseLetMeJoin', ensureMainSite, function(req, res, next){
        User.findOne({}).select('_id').sort({
            _id : -1
        }).exec(function(err, user){
            if(err) { next(err); }
            // If the last user signedup over 10 minutes ago
            // The 60000 is 1 minute
            if((((new Date()) - (new Date(user._id.getTimestamp()))) / 60000) > 10){
                AccessToken.findOne({
                    used: false
                }).select('_id').lean().limit(1).exec(function(err, accessToken){
                    if(err) { next(err); }
                    if(accessToken){
                        res.send({
                            accessToken: accessToken._id
                        });
                    } else {
                        // We ran out of accessTokens
                        res.status(200).send('Sorry, we\'re currently out of accessTokens.');
                    }
                });
            } else {
                // If the last user signed up less than 10 minutes ago
                // then don't give them a free accessToken
                res.status(200).send('NO!');
            }
        });
    });

    app.get(['/privacy', '/tos', '/legal'], function(req, res){
        res.render('legal');
    });

    return app;
})();
