import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipse, bounds, transform, arcInverse, halfArcLength, toPathData, roundRect } from '../src/geometry.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('Ellipse liegt genau in ihrem Rahmen', () => {
  const b = bounds(ellipse(20, 10, 15, 5));
  near(b.x0, 5); near(b.x1, 35); near(b.y0, 5); near(b.y1, 15);
});

test('Transformation: Drehung um 90°', () => {
  const [c] = transform([{ t: 'M', p: [1, 0] }], [0, 1, -1, 0, 0, 0]);
  near(c.p[0], 0); near(c.p[1], 1);
});

test('Bogenlänge: halber Kreisbogen entspricht π·r', () => {
  near(halfArcLength(10, 10), Math.PI * 10, 1e-9);
  const inv = arcInverse(10, 10, 0);
  near(inv(Math.PI * 5), Math.PI / 2, 1e-3);
  near(inv(-Math.PI * 5), -Math.PI / 2, 1e-3);
});

test('Pfaddaten werden gerundet', () => {
  assert.equal(toPathData(roundRect(0, 0, 1 / 3, 1)), 'M0 0L0.3333 0L0.3333 1L0 1Z');
});
