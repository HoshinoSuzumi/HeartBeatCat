import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

// tauri.conf.json
const confPath = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

// Cargo.toml — replace the first version field under [package]
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const replaced = cargo.replace(
  /(\[package\][\s\S]*?)\nversion\s*=\s*"[^"]*"/,
  `$1\nversion = "${version}"`,
);
writeFileSync(cargoPath, replaced);

console.log(`Synced version ${version} to tauri.conf.json and Cargo.toml`);
