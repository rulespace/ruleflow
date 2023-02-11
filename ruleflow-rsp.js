export default
`
(relation [javascript name src])  ; escape to js
(relation [ref name ref])         ; composition

(relation [rand operator port])   ; in_port
(relation [ret operator port])    ; out_port

(relation [link from out_port to in_port])

;;; abstracted operators

;; sources
(relation [interval name low high out_port])

;; operators
(relation [map name in_port f out_port])
(relation [rules name src])

;; sinks
(relation [console name in_port])

`;
