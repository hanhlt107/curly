import {
  blankRequest,
  type ApiRequest,
  type Collection,
  type Environment,
  type SavedRequest,
} from '../types/request';

function row(key = '', value = '') {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function saved(name: string, patch: Partial<ApiRequest>): SavedRequest {
  return {
    id: crypto.randomUUID(),
    name,
    request: { ...blankRequest(), ...patch },
  };
}

export function seedWorkspace(): { collections: Collection[]; environments: Environment[] } {
  const env: Environment = {
    id: crypto.randomUUID(),
    name: 'Demo',
    variables: [row('baseUrl', 'https://jsonplaceholder.typicode.com'), row()],
  };

  const collection: Collection = {
    id: crypto.randomUUID(),
    name: 'Ví dụ · JSONPlaceholder',
    requests: [
      saved('Lấy danh sách bài viết', {
        method: 'GET',
        url: '{{baseUrl}}/posts',
        tests: 'status === 200\ntime < 2000\njson 0.id === 1',
      }),
      saved('Lấy một bài viết', {
        method: 'GET',
        url: '{{baseUrl}}/posts/1',
        tests: 'status === 200\njson id === 1',
      }),
      saved('Tạo bài viết mới', {
        method: 'POST',
        url: '{{baseUrl}}/posts',
        bodyType: 'json',
        body: '{\n  "title": "curly",\n  "body": "Xin chào",\n  "userId": 1\n}',
        tests: 'status === 201',
      }),
    ],
  };

  return { collections: [collection], environments: [env] };
}
