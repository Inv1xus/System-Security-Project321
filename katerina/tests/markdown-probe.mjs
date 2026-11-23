import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from './src/components/MarkdownView.tsx';

const rendered = renderToStaticMarkup(createElement(MarkdownView, { content: '<b>Fixture marker</b>' }));
process.exitCode = rendered.includes('&lt;b&gt;Fixture marker&lt;/b&gt;')
  && !rendered.includes('<b>Fixture marker</b>') ? 0 : 2;
