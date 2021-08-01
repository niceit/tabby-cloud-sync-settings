module.exports = {
  preset: 'ts-jest',
  testMatch: ['**/test/**/*.[jt]s?(x)'],
  testPathIgnorePatterns: ['test/token.ts'],
  testEnvironment: 'node',
};