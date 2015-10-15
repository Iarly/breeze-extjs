// Build for breeze.js

// include gulp
var gulp = require('gulp');

// include plug-ins
// var jshint = require('gulp-jshint');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var rimraf = require('gulp-rimraf');
var shell = require('gulp-shell');
var newer = require('gulp-newer');
var through = require('through');
var eventStream = require('event-stream');

var srcDir = '../src/';
var destDir = './';
var yuidocDestDir = '../docs/api-docs/';
var yuidocThemeDir = '../docs/api-docs-theme/';

var fileNames = ['_head.jsfrag', '*.js', '_tail.jsfrag'];

gulp.task('minify', function () {
    return gulp.src(mapPath(srcDir, fileNames))
      //.pipe(newer(destDir + 'breeze.extjs.debug.js'))
      .pipe(concat('breeze.extjs.debug.js', { newLine: ';' }))
      .pipe(gulp.dest(destDir))
      .pipe(uglify())
      .pipe(rename('breeze.extjs.min.js'))
      .pipe(gulp.dest(destDir));
});

gulp.task('tests', ['minify'], function () {
    testDir = '../tests/'
    return gulp.src(mapPath(destDir, ['breeze.*']))
      .pipe(gulp.dest(testDir))
});

gulp.task('yuidoc-full', ['yuidoc-clean'], function () {
    return gulp.src(mapPath(srcDir, fileNames))
        .pipe(concat('foo'))  // just needed a method that would get n -> 1 would like something smaller.
        .pipe(shell(['yuidoc --themedir ' + yuidocThemeDir + ' --outdir ' + yuidocDestDir + ' ' + "."],
           { cwd: srcDir }));
});

gulp.task('yuidoc-clean', function () {
    return gulp.src(yuidocDestDir, { read: false }) // much faster
      // .pipe(ignore('node_modules/**'))
      .pipe(rimraf({ force: true }));
});

gulp.task('yuidoc', function () {
    return gulp.src(mapPath(srcDir, fileNames))
        .pipe(newer(yuidocDestDir + 'data.json'))
        .pipe(concat('foo')) // eat the stream but yield one to trigger yuidoc to run once

        /* Clever alternative
        .pipe(through(function(file) {
          // pass first file through (don't care what it is; it's just a trigger)
          this.queue(file);
          // then end this stream by passing null to queue, ignoring all additional files
          this.queue(null);
        }))
        */
        .pipe(shell(['yuidoc --themedir ' + yuidocThemeDir + ' --outdir ' + yuidocDestDir + ' ' + "."],
           { cwd: srcDir }));
});

gulp.task('intellisense', ['yuidoc'], function () {
    var gen = require('./intellisense/intellisenseGenerator');
    gen(yuidocDestDir);
    return gulp.src(''); // hack to allow gulp chaining.
});

gulp.task('default', ['minify'/*, 'tests', 'yuidoc', 'intellisense'*/], function () {

});

function mapPath(dir, fileNames) {
    return fileNames.map(function (fileName) {
        return dir + fileName;
    });
};

