import './setup';
import { register, registry, nextId, startedWith } from './registry';
import type { Plugin } from './plugin-types';
import { PluginShape } from './shapes';
import { SHAPE_VERSION } from './versions';
import './plugins/alpha';
import './plugins/beta';
import './plugins/alpha';

const plugin: Plugin = { name: 'gamma' };
const shape: PluginShape = { name: plugin.name };
const version: typeof SHAPE_VERSION = 2;

console.log('main starts');
register(shape.name);
console.log(registry.join(','), nextId(), nextId(), startedWith, version);
