import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// no-undef ของ ESLint ไม่ตรวจชื่อคอมโพเนนต์ใน JSX แท็บจัดนักเรียนเข้าวิชาจึงล่มทั้งหน้ามา 6 สัปดาห์
// เพราะใช้ <UsersRound> โดยไม่ได้ import กฎนี้ไล่ scope ทุกชั้นว่ามีชื่อนั้นประกาศไว้จริง
const jsxNoUndef = {
  meta: { type: 'problem', messages: { undef: "'{{name}}' ถูกใช้ใน JSX แต่ไม่ได้ import หรือประกาศไว้" } },
  create(context) {
    return {
      JSXOpeningElement(node) {
        let name = node.name
        while (name.type === 'JSXMemberExpression') name = name.object
        if (name.type !== 'JSXIdentifier' || !/^[A-Z]/.test(name.name)) return
        for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
          if (scope.set.has(name.name)) return
        }
        context.report({ node: name, messageId: 'undef', data: { name: name.name } })
      },
    }
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { local: { rules: { 'jsx-no-undef': jsxNoUndef } } },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      'local/jsx-no-undef': 'error',
    },
  },
  {
    files: ['*.js', '*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/AuthContext.jsx', 'src/AcademicContext.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
