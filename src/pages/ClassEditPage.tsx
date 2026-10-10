import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ClassInfo } from '../types';
import { Card, EmptyState, Page, Spinner, canGoBack } from '../components/ui';
import ClassForm from '../components/classes/ClassForm';
import DeleteClassDialog from '../components/classes/DeleteClassDialog';
import { useData } from '../data/DataProvider';
import { emptyClass, pickColor, suggestIcon, withClassDefaults } from '../lib/classes';
import './classes.css';

/** state passed by links that should come back to the class page with history.back() */
export interface ClassNavState {
  fromDetail?: string;
}

/** '/classes/new?period=3&day=A&name=Chem' pre-fills the form (used by "add a class for this period" links) */
function newClass(params: URLSearchParams, classes: ClassInfo[]): ClassInfo {
  const name = params.get('name')?.trim() ?? '';
  const period = params.get('period');
  const day = params.get('day');
  return emptyClass({
    name,
    icon: suggestIcon(name),
    color: pickColor(classes),
    periods: period ? [period] : [],
    days: day ? [day] : undefined,
  });
}

export default function ClassEditPage() {
  const { id } = useParams();
  const { classes, loading } = useData();
  const found = id ? classes.find((c) => c.id === id) : undefined;
  // keep showing the class while it's being deleted, until we've navigated away
  const last = useRef(found);
  if (found) last.current = found;
  const [leaving, setLeaving] = useState(false);
  const existing = found ?? (leaving ? last.current : undefined);

  if (loading)
    return (
      <Page title={id ? 'Edit class' : 'Add a class'}>
        <Spinner />
      </Page>
    );
  if (id && !existing)
    return (
      <Page title="Class not found">
        <Card>
          <EmptyState
            icon="🔍"
            title="This class doesn’t exist"
            action={
              <Link to="/classes" className="btn btn-primary">
                All classes
              </Link>
            }
          >
            It may have been deleted on another device.
          </EmptyState>
        </Card>
      </Page>
    );
  return <Editor key={id ?? 'new'} existing={existing} leaving={leaving} onLeaving={() => setLeaving(true)} />;
}

function Editor({ existing, leaving, onLeaving }: { existing?: ClassInfo; leaving: boolean; onLeaving: () => void }) {
  const { classes } = useData();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [initial] = useState(() => (existing ? withClassDefaults(existing) : newClass(params, classes)));
  const [deleting, setDeleting] = useState(false);
  const isNew = !existing;
  const backToDetail = !!existing && (location.state as ClassNavState | null)?.fromDetail === existing.id;

  const leave = (savedId?: string) => {
    if (backToDetail) navigate(-1);
    else if (savedId) navigate(`/classes/${savedId}`, { replace: true });
    else if (isNew) {
      // Back only when it stays in the app (not after onboarding's redirect, or from a shared link)
      if (canGoBack()) navigate(-1);
      else navigate('/classes', { replace: true });
    } else navigate(`/classes/${existing.id}`, { replace: true });
  };

  return (
    <Page title={isNew ? 'Add a class' : `Edit ${existing.name || 'class'}`} subtitle={isNew ? 'Only the name is required. Add the rest now or any time later.' : undefined}>
      <ClassForm
        initial={initial}
        isNew={isNew}
        onSaved={(savedId) => leave(savedId)}
        onCancel={() => leave()}
        onDelete={existing ? () => setDeleting(true) : undefined}
        leaving={leaving}
      />
      {existing && (
        <DeleteClassDialog
          cls={existing}
          open={deleting}
          onClose={() => setDeleting(false)}
          onDeleting={onLeaving}
          onDeleted={() => navigate('/classes', { replace: true })}
        />
      )}
    </Page>
  );
}
