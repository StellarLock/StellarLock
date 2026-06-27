export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['contract', 'frontend', 'ci', 'docs']],
  },
};

pnpm exec husky init
echo "pnpm exec commitlint --edit \$1" > .husky/commit-msg