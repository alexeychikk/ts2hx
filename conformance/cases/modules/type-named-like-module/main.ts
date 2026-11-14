import { load } from './config';

interface Config {
  name: string;
  size: number;
}

type Main = { entry: string };

enum Status {
  Ok,
}

const config: Config = load();
const main: Main = { entry: 'main' };
console.log(config.name, config.size, main.entry, Status.Ok);
