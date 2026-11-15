import { useId } from 'react'

export function StarterArt({ kind = 'orbit', className = '' }) {
  const id = useId().replaceAll(':', '')
  return <svg className={className} viewBox="0 0 240 142" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-orb`} cx=".3" cy=".25" r=".8"><stop stopColor="#FFFDF1"/><stop offset=".45" stopColor="#DCE6D7"/><stop offset="1" stopColor="#7B9691"/></radialGradient>
      <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8F9BFF"/><stop offset="1" stopColor="#3B48B0"/></linearGradient>
      <filter id={`${id}-shadow`}><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <ellipse cx="120" cy="124" rx="59" ry="7" fill="#0B1114" opacity=".6" filter={`url(#${id}-shadow)`}/>
    {kind === 'orbit' && <g>
      <circle cx="120" cy="68" r="35" fill={`url(#${id}-orb)`}/>
      <ellipse cx="120" cy="68" rx="68" ry="24" stroke="#76DAD2" strokeWidth="8" transform="rotate(-26 120 68)"/>
      <ellipse cx="120" cy="68" rx="54" ry="20" stroke="#8794EE" strokeWidth="4" transform="rotate(52 120 68)"/>
      <circle cx="66" cy="93" r="10" fill="#F8A57F"/><circle cx="181" cy="39" r="8" fill={`url(#${id}-blue)`}/>
    </g>}
    {kind === 'robot' && <g>
      <path d="M85 71h70v37H85z" fill={`url(#${id}-orb)`}/><rect x="89" y="27" width="62" height="39" rx="11" fill="#D8E4D9"/>
      <rect x="97" y="37" width="46" height="17" rx="7" fill="#253C3C"/><circle cx="109" cy="45" r="4" fill="#83EAE2"/><circle cx="131" cy="45" r="4" fill="#83EAE2"/>
      <path d="M120 18v-9" stroke="#A0B5B0" strokeWidth="3"/><circle cx="120" cy="8" r="5" fill="#F5AD83"/>
      <path d="M106 108v14m28-14v14M78 78l-8 18m92-18 8-18" stroke="#8794EE" strokeWidth="13" strokeLinecap="round"/>
      <circle cx="120" cy="85" r="6" fill="#F5AD83"/>
    </g>}
    {kind === 'solar' && <g>
      <ellipse cx="120" cy="74" rx="92" ry="27" stroke="#567072" transform="rotate(-20 120 74)"/>
      <ellipse cx="120" cy="74" rx="59" ry="18" stroke="#567072" transform="rotate(-20 120 74)"/>
      <circle cx="120" cy="74" r="29" fill="#F6BC7C"/><circle cx="63" cy="88" r="11" fill="#75D3CE"/><circle cx="204" cy="45" r="13" fill="#D7DDD0"/>
      <ellipse cx="204" cy="45" rx="22" ry="6" stroke="#CC9974" strokeWidth="3" transform="rotate(-23 204 45)"/><circle cx="143" cy="89" r="6" fill="#B67B77"/>
    </g>}
    {kind === 'habitat' && <g>
      <path d="m63 108 67-20 56 24-63 21-60-25Z" fill="#657E69"/><path d="m81 67 42-12 37 20v38l-37 13-42-22V67Z" fill="#DCE6D7"/>
      <path d="m75 68 44-39 49 43-44 14-49-18Z" fill="#8EAC98"/><path d="m124 86 36-11v38l-36 13V86Z" fill="#9EB7AA"/>
      <path d="m96 85 15 6v25l-15-8V85Z" fill="#A48069"/><path d="m135 87 15-5v15l-15 5V87Z" fill="#78D7D3"/>
      <path d="M181 108V73" stroke="#AB9277" strokeWidth="6"/><ellipse cx="181" cy="60" rx="18" ry="25" fill="#9FBEA1"/>
    </g>}
  </svg>
}
