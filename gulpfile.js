var gulp = require('gulp');
var eslint = require('gulp-eslint');
var del = require('del');
var istanbul = require('gulp-istanbul');
var mocha = require('gulp-mocha');
var mkdirp = require('mkdirp');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var mochaPhantomJS = require('gulp-mocha-phantomjs');
var fs = require('fs');
var path = require('path');
var npmTestInstall = require('npm-test-install');
var through = require('through2');
var replace = require('gulp-replace');

gulp.task('default', ['build']);
// Build is checking and then building dist files : di.js and di.min.js and finally check all is packaged
gulp.task('build', ['checks', 'build-dist', 'build-minify', 'test-npm-package']);
// Checking is syntax check, then test raw code with code coverage, and then test on target platforms
gulp.task('checks', ['lint', 'test', 'browser-test']);

gulp.task('lint', function () {
    return gulp.src(['src/*.js', '*.js', 'test/*.js'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

gulp.task('test', ['lint'], function (cb) {
    del.sync(['coverage']);
    return gulp.src(['src/di.js'])
                .pipe(istanbul({includeUntested: true}))
                .pipe(istanbul.hookRequire())
                .on('end', function () {
                    return gulp.src(['test/di.js'])
                            .pipe(mocha())
                            .pipe(istanbul.writeReports({
                                dir: 'coverage',
                                reportOpts: { dir: 'coverage' }
                            }))
                            .pipe(istanbul.enforceThresholds({ thresholds: { global: 98 } }))
                            .on('error', cb);
                });
});

gulp.task('browser-test', ['build-minify'], function (cb) {

    gulp.src('test/di.js')
        .pipe(replace(/var Di(.*);/, ''))
        .pipe(through.obj(function (file, enc, cb) {
            file.contents = browserify(file).bundle();
            cb(null, file);
        }))
        .pipe(rename('di.browser.js'))
        .pipe(gulp.dest('test'))
        .on('end', function () {
            return gulp.src('test/di.browser.html')
                        .pipe(mochaPhantomJS())
                        .on('error', function (e) {
                            del(['test/di.browser.js']); cb(e);
                        })
                        .on('finish', function () {
                            del(['test/di.browser.js']); cb();
                        });
        });

});

gulp.task('build-dist', ['lint'], function () {
    mkdirp.sync('dist');

    return browserify(
        ['src/di.js'],
        { standalone: 'Di' }
    ).bundle()
     .pipe(source('di.js'))
     .pipe(gulp.dest('dist'));

});

gulp.task('build-minify', ['build-dist'], function () {
    gulp.src('dist/di.js')
        .pipe(rename('di.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

gulp.task('test-npm-package', ['build-dist', 'build-minify'], function (cb) {

    npmTestInstall('simple-dijs', __dirname, true).then(function (install) {
        var mainFile = require('./package.json').main,
            miniFile = mainFile.replace(/\.js$/, '.min.js');

        var missingFiles = [ mainFile, miniFile ].filter(function (filename) {
            try {
                fs.accessSync(path.join(install.getPackageDir(), filename));
                return false;
            } catch (e) {
                return true;
            }
        });

        if (missingFiles.length > 0) {
            install.free().then(function () {
                cb('Missing files ' + missingFiles.join(', '));
            }, function (e) {
                console.warn(e);
                cb('Missing files ' + missingFiles.join(', '));
            });
            return;
        }

        console.log('No missing files');
        install.free().then(cb, function (e) {
            console.warn(e);
            cb();
        });
    }, cb);

});