#!/usr/bin/env node
'use strict';

// Runs after `npm install` at the project root: installs every service's own
// dependencies. Services are independent packages (own package-lock.json),
// which keeps each Docker build self-contained.

const { execSync } = require('node:child_process');
const path = require('node:path');

const SERVICES = ['gateway', 'auth', 'product-service', 'order-service', 'orders', 'user-service', 'frontend'];
const root = path.join(__dirname, '..');

for (const service of SERVICES) {
  console.log(`\n> Installing ${service}`);
  execSync('npm install --no-audit --no-fund', { cwd: path.join(root, service), stdio: 'inherit' });
}
