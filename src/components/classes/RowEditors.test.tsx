import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CustomField, LinkItem } from '../../types';
import { CustomFieldsEditor, LinksEditor } from './RowEditors';

function Links() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  return <LinksEditor links={links} onChange={setLinks} errors={{}} idPrefix="t" />;
}
function Fields() {
  const [fields, setFields] = useState<CustomField[]>([]);
  return <CustomFieldsEditor fields={fields} onChange={setFields} errors={{}} idPrefix="t" />;
}

describe('row editors: focus moves to the new row', () => {
  it('after adding a link', () => {
    render(<Links />);
    fireEvent.click(screen.getByRole('button', { name: /Add link/ }));
    expect(document.activeElement).toBe(screen.getByLabelText('Link 1 name'));
  });

  it('to the value after tapping a suggested detail', () => {
    render(<Fields />);
    fireEvent.click(screen.getByRole('button', { name: /Locker #/ }));
    expect(document.activeElement?.classList.contains('cf-value')).toBe(true);
  });
});
