// Card with Tailwind violations
export function Card({ title, children }) {
  return (
    <div className="bg-[#f0f0f0] p-[15px] rounded-[5px] text-[13px]">
      <h2 className="text-[#333333] mb-[7px] font-[450]">{title}</h2>
      <div className="text-[11px] text-[#666]">{children}</div>
    </div>
  );
}
