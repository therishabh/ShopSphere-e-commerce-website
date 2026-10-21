// Jest config (test runner). `npm test` isi ko use karta hai.
export default {
  // Tests Node environment mein chalte hain (browser jaisa jsdom nahi chahiye, ye backend hai).
  testEnvironment: 'node',
  // Sirf `tests/` folder ki `*.test.js` files tests maani jaati hain.
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Jest by default Babel se code transform karta hai (jo ESM ko CommonJS mein badalta hai).
  // `{}` = koi transform nahi: hum native ES modules use karte hain (npm test script mein
  // `--experimental-vm-modules` flag isi ke liye hai).
  transform: {},
};
