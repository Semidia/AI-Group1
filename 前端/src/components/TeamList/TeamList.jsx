import React from 'react';
import styles from './TeamList.module.css';

const PlayerRow = ({ player }) => {
    const getCompanyIcon = (type) => {
        switch (type) {
            case 'human': return '👑';
            case 'ai': return '🤖';
            default: return '🏢';
        }
    };

    return (
        <div className={styles.playerRow}>
            <span>{getCompanyIcon(player.type)}</span>
            <span
                className={styles.playerName}
                style={{ color: player.type === 'human' ? '#00ff9d' : '#00f0ff' }}
            >
                {player.name}
            </span>
            <span className={styles.playerPosition}>
                ({player.type === 'human' ? '玩家公司' : 'AI 公司'})
            </span>
        </div>
    )
}

export default function TeamList({ players }) {
    return (
        <div className={styles.container}>
            <h3 className={styles.title}>竞品公司 (COMPANIES)</h3>
            <div className={styles.list}>
                {players.map(player => (
                    <PlayerRow key={player.id} player={player} />
                ))}
            </div>
        </div>
    );
}
