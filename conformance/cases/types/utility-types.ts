interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
}

type UserPatch = Partial<User>;
type UserSummary = Pick<User, 'id' | 'name'>;
type PublicUser = Omit<User, 'email'>;
type FrozenUser = Readonly<User>;
type CompleteUser = Required<User>;
type Roles = Record<'admin' | 'guest', boolean>;
type Titled = { name: string } & { title: string };
type Flags<T> = { [K in keyof T]: boolean };
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;
type UserKey = keyof User;
type IdType = User['id'];

function makeUser(id: number, name: string): User {
  return { id, name, email: `${name}@example.com` };
}
type Made = ReturnType<typeof makeUser>;

function applyPatch(user: User, patch: UserPatch): User {
  return {
    id: patch.id ?? user.id,
    name: patch.name ?? user.name,
    email: patch.email ?? user.email,
    age: patch.age ?? user.age,
  };
}

const base: Made = makeUser(1, 'ann');
const patched = applyPatch(base, { name: 'anne', age: 30 });
console.log(patched.id, patched.name, patched.email, patched.age);

const summary: UserSummary = { id: patched.id, name: patched.name };
const visible: PublicUser = { id: 2, name: 'bob' };
const frozen: FrozenUser = { id: 3, name: 'cy', email: 'cy@example.com' };
const complete: CompleteUser = {
  id: 4,
  name: 'di',
  email: 'di@example.com',
  age: 40,
};
console.log(
  summary.name,
  visible.age === undefined,
  frozen.email,
  complete.age + 1,
);

const roles: Roles = { admin: true, guest: false };
console.log(roles.admin, roles.guest);

const titled: Titled = { name: 'Smith', title: 'Dr' };
console.log(titled.title + ' ' + titled.name);

const flags: Flags<UserSummary> = { id: true, name: false };
console.log(flags.id, flags.name);

const firstNumber: ElementOf<number[]> = [5, 6][0];
const key: UserKey = 'email';
const id: IdType = 99;
console.log(firstNumber + id, key);

const origin = { x: 0, y: 0 };
type Point = typeof origin;
function shift(point: Point, by: number): Point {
  return { x: point.x + by, y: point.y - by };
}
const moved = shift(origin, 2);
console.log(moved.x, moved.y);

function pick<T, K extends keyof T>(value: T, keys: K[]): number {
  return keys.length;
}
console.log(pick(base, ['id', 'name']));
