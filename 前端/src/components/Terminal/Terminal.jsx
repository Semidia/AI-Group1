import React, { useEffect, useRef } from 'react';
import styles from './Terminal.module.css';

export default function Terminal({ history }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    return (
        <div className={styles.terminal}>
            <div className={styles.content}>
                {history.map((entry) => (
                    <div
                        key={entry.id}
                        className={`${styles.entry} ${entry.type === 'player' ? styles.playerEntry : styles.systemEntry}`}
                    >
                        <span className={styles.prefix}>
                            {entry.type === 'player' ? '> ' : '# '}
                        </span>
                        <span className={styles.text}>{entry.text}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
