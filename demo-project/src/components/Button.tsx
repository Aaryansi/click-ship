// Button with design system violations
export function Button({ children }) {
  return (
    <button
      style={{
        backgroundColor: '#ff0000',  // Should use colors.error
        padding: 15,                  // Not in spacing scale
        fontSize: 13,                 // Not in typography scale
        borderRadius: 5               // Not in radius scale
      }}
    >
      {children}
    </button>
  );
}
