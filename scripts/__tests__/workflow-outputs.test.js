/**
 * Every line a workflow writes to $GITHUB_OUTPUT must be `name=value`; GitHub fails the
 * step on any other line. Grouped `{ ...; } >> "$GITHUB_OUTPUT"` blocks are easy to break
 * by adding a log line, and the deploy jobs that use them only run on main, so PR CI
 * cannot catch the mistake.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', '.github', 'workflows');

function groupedOutputBlocks(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '{') start = i;
    else if (start !== null && trimmed.startsWith('}')) {
      if (/^}\s*>>\s*"\$GITHUB_OUTPUT"/.test(trimmed)) {
        blocks.push({ line: start + 1, body: lines.slice(start + 1, i) });
      }
      start = null;
    }
  }
  return blocks;
}

describe('workflow $GITHUB_OUTPUT blocks', () => {
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f));

  test.each(files)('%s writes only name=value lines', (file) => {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
    for (const block of groupedOutputBlocks(content)) {
      for (const raw of block.body) {
        const line = raw.trim();
        if (!line.startsWith('echo ')) continue;
        if (/>&2\s*$/.test(line)) continue;
        expect({ file, block: block.line, line }).toEqual({
          file,
          block: block.line,
          line: expect.stringMatching(/^echo "(?:\$\{\w+\}|[A-Za-z_][\w-]*)=/),
        });
      }
    }
  });
});
