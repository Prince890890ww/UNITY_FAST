'use strict';
// database.js — compatibility shim
// Older versions of dashboard/server.js require('../src/database')
// This file redirects to the actual database module
module.exports = require('./commands/index');
