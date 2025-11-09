/**
 * Jest config to transform JS/JSX using babel-jest so admin React tests run in repo-level Jest.
 */
module.exports = {
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  testPathIgnorePatterns: ['/node_modules/', '/admin/'],
  moduleFileExtensions: ['js', 'jsx', 'json', 'node']
}
