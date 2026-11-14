enum Status {
  Idle,
  Running = 5,
  Done,
  Failed = -1,
  Alias = 5,
}

enum Flags {
  None = 0,
  A = 1 << 0,
  B = 1 << 1,
  AB = A | B,
  Big = 2.5 * 4,
}

console.log(
  Status.Idle,
  Status.Running,
  Status.Done,
  Status.Failed,
  Status.Alias,
);
console.log(Status[0], Status[5], Status[6], Status[-1], Status[42]);
console.log(Status[Status.Done], Status['Done'], Status[Status.Failed]);
const s: Status = Status.Done;
const n: number = s + 1;
console.log(n, s * 2, s > Status.Running, Status[s]);
console.log(Flags.AB, Flags.A | Flags.B, (Flags.AB & Flags.B) !== 0, Flags.Big);
console.log(Flags[3], Flags[10]);
console.log(Object.keys(Status).join(','));
console.log(Object.values(Status).join(','), Object.values(Status).length);
console.log(Object.keys(Flags).join(','), Object.entries(Flags).length);
console.log(Object.entries(Status)[1], Object.entries(Status)[5]);
const names: string[] = [];
for (let i = 0; i < 7; i++) {
  names.push(Status[i] ?? '-');
}
console.log(names.join(','));
