// Decorative artwork, not an interactive preview or a source of product state.
export function AuthBrand() {
  return (
    <section className="auth-story" aria-label="CoLearnia">
      <div className="auth-brand">
        <span className="auth-mark" aria-hidden="true">
          C
        </span>
        <strong>CoLearnia</strong>
      </div>
      <div className="auth-story-copy">
        <h2>
          Học cùng nhau.
          <br />
          <span>Tiến xa hơn.</span>
        </h2>
        <p>
          Một nơi để gặp gỡ, chia sẻ ý tưởng và cùng nhóm biến những điều đang học thành điều đã
          hiểu.
        </p>
      </div>
      <svg
        className="auth-art"
        viewBox="0 0 500 330"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <ellipse cx="250" cy="302" rx="193" ry="13" className="auth-art-ground" />
        <circle cx="256" cy="158" r="134" className="auth-art-wash" />
        <circle cx="422" cy="63" r="5" className="auth-art-accent" />
        <path
          d="M62 159h14m-7-7v14M416 255h14m-7-7v14"
          className="auth-art-line"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g className="auth-art-window">
          <rect
            x="85"
            y="62"
            width="330"
            height="216"
            rx="16"
            className="auth-art-paper auth-art-outline"
          />
          <path d="M85 94h330" className="auth-art-outline" />
          <circle cx="102" cy="78" r="3" className="auth-art-accent" />
          <circle cx="113" cy="78" r="3" className="auth-art-ground" />
          <circle cx="124" cy="78" r="3" className="auth-art-ground" />
          <rect x="256" y="73" width="140" height="10" rx="5" className="auth-art-wash" />
          <rect x="101" y="108" width="143" height="117" rx="10" className="auth-art-mint" />
          <rect x="256" y="108" width="143" height="117" rx="10" className="auth-art-sand" />
          <path d="M127 225v-12c0-24 20-40 45-40s45 16 45 40v12" className="auth-art-accent" />
          <path d="M158 174l14 22 15-22" className="auth-art-paper" />
          <rect x="165" y="162" width="15" height="20" rx="7" className="auth-art-skin" />
          <ellipse cx="172" cy="145" rx="23" ry="28" className="auth-art-skin" />
          <path
            d="M149 148c-8-35 14-39 24-35 22-1 27 17 21 37l-6-16c-12 3-22 0-28-5l-11 19Z"
            className="auth-art-ink"
          />
          <path
            d="M165 155q7 5 14 0"
            className="auth-art-line"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M282 225v-12c0-24 20-40 45-40s45 16 45 40v12" className="auth-art-lavender" />
          <path d="M313 175l14 20 15-20" className="auth-art-paper" />
          <rect x="320" y="161" width="15" height="21" rx="7" className="auth-art-skin-deep" />
          <path
            d="M300 161c-9-38 6-50 26-49 26-1 37 24 26 65l-14-9-38-7Z"
            className="auth-art-ink"
          />
          <ellipse cx="327" cy="145" rx="22" ry="27" className="auth-art-skin-deep" />
          <path d="M304 139q8-31 29-23l17 22q-23 0-31-13l-15 14Z" className="auth-art-ink" />
          <path
            d="M320 155q7 5 14 0"
            className="auth-art-line"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="101" y="239" width="82" height="8" rx="4" className="auth-art-wash" />
          <rect x="101" y="253" width="54" height="6" rx="3" className="auth-art-wash" />
          <circle cx="304" cy="249" r="12" className="auth-art-wash" />
          <circle cx="339" cy="249" r="12" className="auth-art-wash" />
          <rect x="363" y="237" width="36" height="24" rx="12" className="auth-art-accent" />
          <path d="M375 249h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="auth-art-note">
          <rect
            x="25"
            y="222"
            width="145"
            height="58"
            rx="12"
            className="auth-art-paper auth-art-outline"
          />
          <rect x="38" y="235" width="29" height="29" rx="9" className="auth-art-mint" />
          <path
            d="M46 250l5 5 9-11"
            className="auth-art-line"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="78" y="239" width="75" height="7" rx="3.5" className="auth-art-accent" />
          <rect x="78" y="253" width="53" height="6" rx="3" className="auth-art-wash" />
        </g>
        <g className="auth-art-chat">
          <path
            d="M354 27h99a12 12 0 0112 12v35a12 12 0 01-12 12h-66l-19 14V86h-14a12 12 0 01-12-12V39a12 12 0 0112-12Z"
            className="auth-art-accent"
          />
          <circle cx="369" cy="57" r="4" className="auth-art-paper" />
          <circle cx="388" cy="57" r="4" className="auth-art-paper" />
          <circle cx="407" cy="57" r="4" className="auth-art-paper" />
          <path
            d="M427 48l7 9-7 9"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <p className="auth-story-footer">Kết nối ý tưởng. Cùng nhau học hỏi.</p>
    </section>
  );
}
