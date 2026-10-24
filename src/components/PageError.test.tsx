import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PageError from './PageError';

function Boom(): never {
  throw new Error('Cannot read properties of undefined');
}

describe('PageError', () => {
  it('replaces only the crashed page, so the nav still works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <nav>
                <Link to="/">Today</Link>
              </nav>
              <Outlet />
            </>
          ),
          children: [{ errorElement: <PageError />, children: [{ index: true, element: <p>TODAY PAGE</p> }, { path: 'classes/c1', element: <Boom /> }] }],
        },
      ],
      { initialEntries: ['/classes/c1'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument();
    await act(() => router.navigate('/'));
    expect(screen.getByText('TODAY PAGE')).toBeInTheDocument();
  });
});
