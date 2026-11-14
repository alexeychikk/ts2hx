interface Config {
  host: string;
  port: number;
  secure: boolean;
}

type ConfigKey = keyof Config;
type Port = Config['port'];

const config: Config = { host: 'localhost', port: 8080, secure: false };

function getProp<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

function setProp<T, K extends keyof T>(obj: T, key: K, value: T[K]): void {
  obj[key] = value;
}

function describe(key: ConfigKey): string {
  return key + ':' + String(config[key]);
}

const port: Port = getProp(config, 'port');
console.log(port + 1, getProp(config, 'host').toUpperCase());
setProp(config, 'secure', true);
setProp(config, 'port', 443);
console.log(config.secure, config.port);

const keys: ConfigKey[] = ['host', 'port', 'secure'];
console.log(keys.map(describe).join(' '));

type Scores = { [player: string]: number };
const scores: Scores = { ann: 3, bob: 5 };
function lookup<K extends keyof Scores>(key: K): Scores[K] {
  return scores[key];
}
console.log(lookup('ann') + lookup('bob'));

type Item = { id: number; tags: string[] };
type Tag = Item['tags'][number];
const item: Item = { id: 1, tags: ['a', 'b'] };
const tag: Tag = item.tags[1];
console.log(tag, item['id']);

const settings = { width: 10, height: 20 };
type SettingKey = keyof typeof settings;
function area(s: typeof settings): number {
  let product = 1;
  const names: SettingKey[] = ['width', 'height'];
  for (const name of names) product *= s[name];
  return product;
}
console.log(area(settings));

function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((i) => i[key]);
}
console.log(pluck([config], 'host').join(), pluck([item, item], 'id').join('+'));
