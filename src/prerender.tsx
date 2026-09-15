import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import Landing from './pages/Landing';

export function render(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <Landing />
    </StaticRouter>,
  );
}
