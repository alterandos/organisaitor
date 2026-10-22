import { describe, expect, it } from 'vitest';
import { hasFormatting, richLines, richToPlain, sanitizeInlineHtml } from './richText';

describe('formatted text in block fields', () => {
  it('keeps the inline formatting, without attributes, in its plain names', () => {
    expect(sanitizeInlineHtml('H<sub>2</sub>O is <strong>water</strong>, <em style="color:red">wet</em>')).toBe('H<sub>2</sub>O is <b>water</b>, <i>wet</i>');
    expect(sanitizeInlineHtml('a<strike>b</strike><u>c</u><sup>2</sup><code>x</code>')).toBe('a<s>b</s><u>c</u><sup>2</sup><code>x</code>');
  });

  it('drops anything else, keeping its text, and never lets a tag through', () => {
    expect(sanitizeInlineHtml('<span style="x">hi</span><div>there</div>')).toBe('hithere');
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>ok')).toBe('&lt;img src=x onerror=alert(1)&gt;ok');
    expect(sanitizeInlineHtml('<scr<script>ipt>alert(1)</script>')).not.toMatch(/<script/i);
    expect(sanitizeInlineHtml('<a href="javascript:x">link</a>')).not.toMatch(/<a\b/);
  });

  it('keeps a link to a Glossary term with only its checked id, and reads it plain', () => {
    expect(sanitizeInlineHtml('the <a data-term="e1_x" href="javascript:x" onclick="y">ASX</a> rule')).toBe('the <a data-term="e1_x">ASX</a> rule');
    expect(sanitizeInlineHtml('<a data-term="bad id">x</a>')).toBe('x');
    expect(sanitizeInlineHtml('<a data-term="x&quot;>"><b>y</b></a>')).not.toMatch(/<a /);
    expect(sanitizeInlineHtml('<a data-term="e1"><b>ASX</b>')).toBe('<a data-term="e1"><b>ASX</b></a>');
    expect(richToPlain('the <a data-term="e1">ASX</a> rule')).toBe('the ASX rule');
    expect(hasFormatting('<a data-term="e1">ASX</a>')).toBe(true);
  });

  it('plain text with < and > stays as typed', () => {
    expect(sanitizeInlineHtml('a < b and x<y and z>w')).toBe('a &lt; b and x&lt;y and z&gt;w');
    expect(richToPlain('a < b and x<y and z>w')).toBe('a < b and x<y and z>w');
    expect(richToPlain('R&D')).toBe('R&D');
  });

  it('closes what was left open, and drops trailing line breaks', () => {
    expect(sanitizeInlineHtml('<b>bold')).toBe('<b>bold</b>');
    expect(sanitizeInlineHtml('one<br>two<br><br>')).toBe('one<br>two');
  });

  it('reads plain: no tags, entities decoded, a line break as a new line', () => {
    expect(richToPlain('H<sub>2</sub>O &amp; CO<sub>2</sub>')).toBe('H2O & CO2');
    expect(richToPlain('one<br>two')).toBe('one\ntwo');
    expect(hasFormatting('plain')).toBe(false);
    expect(hasFormatting('<b>x</b>')).toBe(true);
    expect(hasFormatting('<span>x</span>')).toBe(false);
  });

  it('an edited list: a line per item, cleaned, empty lines dropped', () => {
    expect(richLines('<div>one</div><div><b>two</b></div><div><br></div>')).toEqual(['one', '<b>two</b>']);
    expect(richLines('first<div>second</div>')).toEqual(['first', 'second']);
  });
});
