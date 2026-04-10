import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const baseUrl = __ENV.BASE_URL;

if (!baseUrl) {
  throw new Error('BASE_URL env var is required, e.g. k6 run -e BASE_URL=https://example.com scripts/k6/health-smoke.js');
}

export default function () {
  const res = http.get(`${baseUrl}/api/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(0.2);
}
