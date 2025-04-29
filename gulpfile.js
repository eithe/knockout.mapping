"use strict";

const gulp = require("gulp");
const del = require("del");
const qunit = require("gulp-qunit");
const plumber = require("gulp-plumber");
const uglify = require("gulp-uglify");
const replace = require("gulp-replace");
const rename = require("gulp-rename");
const header = require("gulp-header");
const sourceMaps = require("gulp-sourcemaps");

const buildConfig = {
  outputPath: "dist",
  pkg: require("./package.json"),
  banner: [
    "/*!",
    " * Knockout Mapping plugin v<%= pkg.version %>",
    " * (c) 2013 Steven Sanderson, Roy Jacobs - http://knockoutjs.com/",
    " * License: MIT (http://www.opensource.org/licenses/mit-license.php)",
    " */\n",
  ].join("\n"),
};

gulp.task("clear", function () {
  return del.deleteAsync("*", { cwd: "dist" });
});

gulp.task("build", function () {
  return gulp
    .src("knockout.mapping.js")
    .pipe(plumber({ errorHandler: process.env.NODE_ENV === "development" }))
    .pipe(header(buildConfig.banner, { pkg: buildConfig.pkg }))
    .pipe(gulp.dest(buildConfig.outputPath))
    .pipe(rename("knockout.mapping.min.js"))
    .pipe(replace(/(:?var\s*?DEBUG\s*?=\s*?true)/, "const DEBUG=false"))
    .pipe(sourceMaps.init())
    .pipe(uglify())
    .pipe(sourceMaps.write("./"))
    .pipe(gulp.dest(buildConfig.outputPath));
});

gulp.task(
  "test",
  gulp.series("build", function () {
    return gulp
      .src(process.env.CI ? "spec/spec-runner-*.htm" : "spec/spec-runner.htm")
      .pipe(plumber({ errorHandler: process.env.NODE_ENV === "development" }))
      .pipe(qunit({ timeout: 30 }));
  })
);

gulp.task("default", gulp.series("clear", "test"));

gulp.task("watch", function () {
  gulp.watch(
    ["knockout.mapping.js", "spec/spec-runner.htm", "spec/*.js"],
    gulp.series("clear", "test")
  );
});
