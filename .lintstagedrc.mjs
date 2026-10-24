export default {
  '*.{js,mjs,cjs,ts,tsx,jsx}': ['prettier --write', 'eslint --fix --max-warnings=0'],
  '!(*.{js,mjs,cjs,ts,tsx,jsx})': 'prettier --write --ignore-unknown',
};
