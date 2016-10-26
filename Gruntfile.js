module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        express: {
            all: {
                options: {
                    bases: ['./build'],
                    port: 8080,
                    hostname: "0.0.0.0",
                    livereload: true
                }
            }
        },
        sass: {
            dist: {
                files: {
                  'build/static/css/style.css': 'source/sass/main.scss'
                }
            }
        },
        cssmin: {
            target: {
                files: [{
                    expand: true,
                    cwd: 'build/static/css',
                    src: ['*.css', '!*.min.css'],
                    dest: 'build/static/css',
                    ext: '.min.css'
                }]
            }
        },
        copy: {
            main: {
                files: [{
                    expand: true,
                    cwd: 'source/templates/',
                    src: '**',
                    dest: 'build/',
                }, {
                    expand: true,
                    cwd: 'source/images/',
                    src: '**',
                    dest: 'build/static/images/',
                }, {
                    expand: true,
                    cwd: 'source/fonts/',
                    src: '**',
                    dest: 'build/static/fonts/',
                }, {
                    expand: true,
                    cwd: 'source/js/',
                    src: '**',
                    dest: 'build/static/js/',
                }]

            }
        },
        watch: {
            sass: {
                files: ['source/sass/**/*.scss', 'source/template/**/*.html'],
                tasks: ['sass', 'cssmin', 'copy']
            },
            all: {
                files: '**/*.html',
                options: {
                    livereload: true
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-express');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-sass');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.registerTask('server', ['copy', 'express', 'dev', 'watch']);
    grunt.registerTask('dev', ['sass', 'cssmin', 'copy']);
    grunt.registerTask('dev-css', ['sass', 'cssmin']);
}
