const fs = require('fs');
const path = require('path');

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.d.ts'];

function loadTsConfigPaths(tsconfigPath) {
  const resolvedConfigPath = path.resolve(tsconfigPath);

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(`tsconfig file not found at ${resolvedConfigPath}`);
  }

  const rawContent = fs.readFileSync(resolvedConfigPath, 'utf8');
  let tsconfig;

  try {
    tsconfig = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Unable to parse ${resolvedConfigPath}: ${error.message}`);
  }

  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object') {
    throw new Error(`No "compilerOptions.paths" section found in ${resolvedConfigPath}`);
  }

  return { paths, tsconfigDir: path.dirname(resolvedConfigPath) };
}

function existsPathCandidate(candidate) {
  if (fs.existsSync(candidate)) {
    return true;
  }

  for (const extension of TS_EXTENSIONS) {
    if (fs.existsSync(`${candidate}${extension}`)) {
      return true;
    }
  }

  return false;
}

function validatePathAliases(tsconfigPath) {
  const { paths, tsconfigDir } = loadTsConfigPaths(tsconfigPath);
  const errors = [];

  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) {
      errors.push(`Alias "${alias}" must map to a non-empty array of path targets.`);
      continue;
    }

    const aliasHasWildcard = alias.endsWith('/*');
    if (!aliasHasWildcard && alias.includes('*')) {
      errors.push(`Alias "${alias}" contains wildcard characters but is missing a trailing "/*" suffix.`);
    }

    for (const target of targets) {
      if (typeof target !== 'string' || target.trim() === '') {
        errors.push(`Alias target for "${alias}" must be a non-empty string.`);
        continue;
      }

      const targetHasWildcard = target.endsWith('/*');
      if (aliasHasWildcard !== targetHasWildcard) {
        errors.push(
          `Alias pattern mismatch for "${alias}" -> "${target}". ` +
            'Both alias and target should either include a wildcard suffix "/*" or omit it together.'
        );
      }

      if (!target.startsWith('./') && !target.startsWith('../')) {
        errors.push(`Alias target "${target}" for "${alias}" must be relative to the tsconfig file, starting with ./ or ../.`);
      }

      const pathBase = targetHasWildcard ? target.slice(0, -2) : target;
      const absoluteBase = path.resolve(tsconfigDir, pathBase);

      if (!existsPathCandidate(absoluteBase)) {
        errors.push(
          `Alias target path for "${alias}" does not resolve to an existing file or directory: ${absoluteBase}`
        );
      }
    }
  }

  return errors;
}

function formatErrors(errors) {
  return errors.map((message, index) => `${index + 1}. ${message}`).join('\n');
}

function run() {
  try {
    const errors = validatePathAliases(path.resolve(__dirname, '../tsconfig.json'));
    if (errors.length > 0) {
      console.error('Path alias validation failed:');
      console.error(formatErrors(errors));
      process.exit(1);
    }

    console.log('Path alias validation passed. All alias targets resolve successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Path alias validation could not complete:');
    console.error(error.message || error);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  loadTsConfigPaths,
  validatePathAliases,
  formatErrors,
};
