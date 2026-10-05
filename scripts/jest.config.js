// Run from backend/ (which provides jest + fast-check): npx jest --config ../scripts/jest.config.js
const path = require('path');

module.exports = {
  rootDir: __dirname,
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  testEnvironment: 'node',
  modulePaths: [path.join(__dirname, '..', 'backend', 'node_modules')],
};
