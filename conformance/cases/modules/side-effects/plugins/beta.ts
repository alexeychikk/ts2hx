import { register, registry } from '../registry';

if (registry.length > 0) {
  register('beta after ' + registry[0]);
}
