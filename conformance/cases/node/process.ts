const args = process.argv;
console.log(args.length >= 2, typeof args[0], args.slice(2));

const written = process.stdout.write('no newline, ');
process.stdout.write(`written: ${written}\n`);
process.stdout.write('a' + 'b' + '\n');
process.stderr.write('to stderr\n');

function finish(code: number): void {
  console.log('exiting with', code);
  process.exit(code);
}

finish(0);
console.log('not printed');
