var mongoose = require('mongoose'),
    bcrypt = require('bcrypt'),
    SALT_WORK_FACTOR = 10;

var userSchema = new mongoose.Schema({
    email: String,
    password: String,
    blogs: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Blog',
            required: true
        }
    ],
    resetPasswordToken: String,
    resetPasswordExpires: String,
    isAdmin: {
        type: Boolean,
        default: false
    }
});

// Bcrypt middleware
userSchema.pre('save', function(next) {
    var user = this;

    if(!user.isModified('password')) { return next(); }

    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
        if(err) { return next(err); }

        bcrypt.hash(user.password, salt, function(err, hash) {
            if(err) { return next(err); }
            user.password = hash;
            next();
        });
    });
});

// Password verification
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if(err) { return cb(err); }
        cb(null, isMatch);
    });
};

module.exports = mongoose.model('User', userSchema);
