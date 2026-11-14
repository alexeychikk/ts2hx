const point = { y: 2, x: 1, z: 3 };
console.log(Object.keys(point), Object.values(point));
console.log(JSON.stringify(point));

const dict: Record<string, number> = {};
dict['zeta'] = 1;
dict['alpha'] = 2;
dict['10'] = 3;
dict['2'] = 4;
dict['mid'] = 5;
console.log(Object.keys(dict).join(','));
for (const key in dict) {
  console.log(key, dict[key]);
}
delete dict['alpha'];
console.log(Object.entries(dict));
console.log('zeta' in dict, 'alpha' in dict);
const merged = { ...point, w: 0, x: 9 };
console.log(merged);
