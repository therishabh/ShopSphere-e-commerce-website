// ESLint config (flat config format): code mein galtiyan aur kharaab patterns pakadne ke liye.
// `npm run lint` isi file ko padhta hai. Formatting (spaces, quotes) ESLint nahi dekhta; wo Prettier ka kaam hai.

// ESLint ke recommended rules (unused variables, undefined variables, duplicate keys jaise aam bugs).
import js from '@eslint/js';
// Pre-defined global variables ki lists (node ke liye `process`, `console`; jest ke liye `describe`, `test`...).
import globals from 'globals';
// Aise ESLint rules ko off karta hai jo Prettier ke formatting se takrate; hamesha sabse last mein lagana hai.
import prettier from 'eslint-config-prettier';

// Flat config = ek array; peeche wale items pehle wale items ko override kar sakte hain.
export default [
  // In folders ko lint hi mat karo.
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    // ES modules (`import/export`) aur latest JavaScript syntax; Node ke globals (process, console...) known hain.
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      // `===` hi use karo, `==` nahi (type-coercion wali galtiyon se bachne ke liye).
      eqeqeq: ['error', 'always'],
      // `var` mat use karo; `let`/`const` use karo.
      'no-var': 'error',
      // Jo variable kabhi reassign nahi hota use `const` banao.
      'prefer-const': 'error',
      // Unused variables/arguments error; lekin naam `_` se shuru ho (jaise `_req`) to chalega:
      // express handlers mein kai arguments zaruri hote hain bhale hi use na ho.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Test files ko Jest ke globals (describe, test, expect...) bhi chahiye.
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.jest } } },
  // Sabse last: Prettier se conflict karne wale rules band.
  prettier,
];
