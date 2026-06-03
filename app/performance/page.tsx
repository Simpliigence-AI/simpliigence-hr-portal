'use client'
import { useState } from 'react'
import DetailedTemplate from './DetailedTemplate'

export default function PerformancePage() {
  const [msg] = useState('COMPILE-TEST-XYZ')
  return (
    <div>
      <div>{msg}</div>
      <DetailedTemplate onDataChange={function() {}} />
    </div>
  )
}
