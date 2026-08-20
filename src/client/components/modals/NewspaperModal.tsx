/**
 * NewspaperModal — the town paper's editorial section.
 *
 * What Voyager's "Rate the Mayor" button opens (`TownHallSheet.pas:337-353`):
 * `boardreader.asp`, a two-frame board — the column index on the left, the open
 * column on the right — which it shows FULL SCREEN and which closes the object
 * inspector behind it (`frame_Close=yes`, `:352`).
 *
 * Here it is a modal, and the two frames become one column with a back link:
 * the index until you open a column, the column until you go back. The rating
 * form Voyager bolts onto this page is NOT here — it lives on the Politics tab,
 * where it talks to `RDOSetRatingFrom` directly instead of through the board.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, X, RefreshCw } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useNewspaperStore } from '../../store/newspaper-store';
import { useClient } from '../../context';
import { IconButton, SkeletonLines } from '../common';
import styles from './NewspaperModal.module.css';

export function NewspaperModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const client = useClient();

  const context = useNewspaperStore((s) => s.context);
  const board = useNewspaperStore((s) => s.board);
  const loadState = useNewspaperStore((s) => s.loadState);
  const isPosting = useNewspaperStore((s) => s.isPosting);

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const isOpen = modal === 'newspaper';

  // Same lazy contract as the Politics tab: nothing is read until the board is
  // on screen, and `loadState` back at `idle` is the re-read signal.
  useEffect(() => {
    if (isOpen && context && loadState === 'idle') {
      client.onRequestNewspaperBoard();
    }
  }, [isOpen, context, loadState, client]);

  // A published column clears the form; a refused one keeps what was typed.
  useEffect(() => {
    if (!isPosting && composing && board?.columns.some((c) => c.subject === subject.trim())) {
      setComposing(false);
      setSubject('');
      setBody('');
    }
  }, [isPosting, composing, board, subject]);

  if (!isOpen) return null;

  const article = board?.article ?? null;
  const paperName = context?.paperName ?? 'Newspaper';

  const handleClose = () => closeModal();

  const handlePost = () => {
    // A reply goes under the open column; otherwise it is a new top-level column.
    client.onPostNewspaperColumn(subject.trim(), body, article ? board?.path : undefined);
  };

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-label={`${paperName} — editorial section`}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{paperName}</h2>
            <span className={styles.subtitle}>Editorial section</span>
          </div>
          <div className={styles.headerActions}>
            <IconButton
              icon={<RefreshCw size={16} />}
              label="Refresh"
              size="sm"
              variant="ghost"
              onClick={() => useNewspaperStore.getState().setLoadState('idle')}
            />
            <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {loadState === 'loading' && <SkeletonLines lines={6} />}

          {loadState === 'error' && (
            <div className={styles.error}>{board?.error || 'The newspaper could not be reached.'}</div>
          )}

          {loadState === 'loaded' && board && (
            article ? (
              <article className={styles.article}>
                <button
                  className={styles.backLink}
                  onClick={() => client.onRequestNewspaperBoard()}
                >
                  <ArrowLeft size={14} /> All columns
                </button>
                <h3 className={styles.articleTitle}>{article.subject}</h3>
                {article.byline && <p className={styles.byline}>{article.byline}</p>}
                <p className={styles.articleBody}>{article.body}</p>

                {article.replies.length > 0 && (
                  <>
                    <h4 className={styles.sectionTitle}>Replies</h4>
                    <ul className={styles.columnList}>
                      {article.replies.map((reply) => (
                        <li key={reply.path}>
                          <button
                            className={styles.columnLink}
                            onClick={() => client.onRequestNewspaperBoard(reply.path)}
                          >
                            <span className={styles.columnAuthor}>{reply.author}</span>
                            <span className={styles.columnSubject}>{reply.subject}</span>
                          </button>
                          {reply.summary && <p className={styles.columnSummary}>{reply.summary}</p>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            ) : (
              <>
                <p className={styles.lead}>
                  Read the columns published by your fellow investors, or post one
                  of your own.
                </p>
                <h4 className={styles.sectionTitle}>Latest columns</h4>
                {board.columns.length === 0 ? (
                  <p className={styles.empty}>Nobody has written a column yet.</p>
                ) : (
                  <ul className={styles.columnList}>
                    {board.columns.map((column) => (
                      <li key={column.path}>
                        <button
                          className={styles.columnLink}
                          onClick={() => client.onRequestNewspaperBoard(column.path)}
                        >
                          <span className={styles.columnAuthor}>{column.author}</span>
                          <span className={styles.columnSubject}>{column.subject}</span>
                        </button>
                        {column.summary && <p className={styles.columnSummary}>{column.summary}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          )}

          {loadState === 'loaded' && (
            <div className={styles.composer}>
              {composing ? (
                <>
                  <h4 className={styles.sectionTitle}>
                    {article ? `Reply to “${article.subject}”` : 'Post a column'}
                  </h4>
                  <label className={styles.field}>
                    <span>Subject</span>
                    <input
                      className={styles.input}
                      value={subject}
                      maxLength={120}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Column</span>
                    <textarea
                      className={styles.textarea}
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  </label>
                  <div className={styles.composerActions}>
                    <button
                      className={styles.primaryBtn}
                      disabled={isPosting || subject.trim() === ''}
                      onClick={handlePost}
                    >
                      {isPosting ? 'Publishing…' : article ? 'Post Reply' : 'Post Column'}
                    </button>
                    <button
                      className={styles.secondaryBtn}
                      disabled={isPosting}
                      onClick={() => { setSubject(''); setBody(''); }}
                    >
                      Reset Form
                    </button>
                    <button
                      className={styles.secondaryBtn}
                      disabled={isPosting}
                      onClick={() => setComposing(false)}
                    >
                      Hide Form
                    </button>
                  </div>
                </>
              ) : (
                <button className={styles.primaryBtn} onClick={() => setComposing(true)}>
                  {article ? 'Reply to this column' : 'Post a column'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
