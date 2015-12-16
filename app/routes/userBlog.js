var express = require('express'),
    jade = require('jade'),
    async = require('async'),
    Theme = require('../models/Theme');

module.exports = (function() {
    var app = express.Router();

    function ensureBlogExists(req, res, next) {
        if(Object.keys(res.locals.blog).length){
            next();
        } else {
            next('blog doesn\'t exist');
        }
    }

    function redirectToCustomDomain(req, res, next) {
        if(res.locals.blog.customDomain && res.locals.domain !== res.locals.blog.customDomain){
            res.redirect('http://' + res.locals.blog.customDomain);
        } else {
            next();
        }
    }

    app.get('/', ensureBlogExists, redirectToCustomDomain, function(req, res, next){
        async.waterfall([
            function(callback) {
                // Try to find the blog's theme
                Theme.findOne({
                    blog: res.locals.blog._id
                }).lean().sort('date').exec(function(err, theme){
                    if(err) { next(err); }
                    callback(null, theme);
                });
            }, function(theme, callback) {
                // If we can't find the theme then we use the default one
                if(!theme){
                    Theme.findOne({
                        url: '============='
                    }).lean().sort('data').exec(function(err, theme){
                        if(err) { next(err); }
                        callback(null, theme);
                    });
                } else {
                    callback(null, theme);
                }
            }
        ], function(err, theme) {
            if(err) { next(err); }
            if(theme){
                // Add any extras we need to locals
                theme.locals.url = res.locals.blog.url;
                theme.locals.customDomain = res.locals.blog.customDomain;
                theme.locals.followers = res.locals.blog.followers;

                var fn = jade.compile(theme.jade, {});
                var html = fn(theme.locals);
                res.send(html);
            } else {
                // If we still don't have a theme var then we're
                // missing the default theme and should just tell them
                // This should really only ever happen in dev
                next('The default theme is missing!');
            }
        });
    });

    return app;
})();
