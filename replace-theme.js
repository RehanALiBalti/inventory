const fs = require('fs');
const path = require('path');

const replacements = [
  // Backgrounds
  ['bg-surface-950', 'bg-surface-50'],
  ['bg-surface-900', 'bg-surface-100'],
  ['bg-surface-800/80', 'bg-white'],
  ['bg-surface-800/60', 'bg-white'],
  ['bg-surface-800/40', 'bg-surface-50'],
  ['bg-surface-800', 'bg-white'],
  ['bg-surface-700', 'bg-surface-100'],
  ['bg-surface-600', 'bg-surface-200'],
  // Hovers
  ['hover:bg-surface-800/60', 'hover:bg-surface-50'],
  ['hover:bg-surface-800/80', 'hover:bg-surface-50'],
  ['hover:bg-surface-800/40', 'hover:bg-surface-100'],
  ['hover:bg-surface-800', 'hover:bg-surface-50'],
  ['hover:bg-surface-700', 'hover:bg-surface-100'],
  ['hover:bg-surface-600', 'hover:bg-surface-200'],
  ['hover:text-surface-100', 'hover:text-surface-900'],
  ['hover:text-surface-300', 'hover:text-surface-700'],
  // Text
  ['text-surface-50', 'text-surface-900'],
  ['text-surface-100', 'text-surface-900'],
  ['text-surface-200', 'text-surface-800'],
  ['text-surface-300', 'text-surface-700'],
  ['text-surface-400', 'text-surface-500'],
  ['text-surface-500', 'text-surface-400'],
  // Borders
  ['border-surface-700/50', 'border-surface-200'],
  ['border-surface-800/50', 'border-surface-200'],
  ['border-surface-700', 'border-surface-200'],
  ['border-surface-800', 'border-surface-200'],
  // Divide
  ['divide-surface-800/50', 'divide-surface-200'],
  ['divide-surface-800', 'divide-surface-200'],
  // Specific tweaks
  ['shadow-surface-950/50', 'shadow-surface-200/50'],
  ['placeholder:text-surface-500', 'placeholder:text-surface-400']
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let newContent = content;
      
      // Apply replacements in order
      for (const [oldClass, newClass] of replacements) {
        // use regex to match the exact word to avoid partial matches
        // e.g. text-surface-50 shouldn't match text-surface-500
        const regex = new RegExp(oldClass.replace(/\//g, '\\/') + '(?![0-9])', 'g');
        newContent = newContent.replace(regex, newClass);
      }
      
      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir('./src');
console.log('Theme replacement complete!');
