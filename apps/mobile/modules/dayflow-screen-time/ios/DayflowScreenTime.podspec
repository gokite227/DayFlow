Pod::Spec.new do |s|
  s.name           = 'DayflowScreenTime'
  s.version        = '0.1.0'
  s.summary        = 'DayFlow Focus app blocking on iOS (Screen Time) — skeleton'
  s.description    = 'Placeholder for FamilyControls / ManagedSettings / DeviceActivity. Blocks nothing yet.'
  s.license        = 'UNLICENSED'
  s.author         = 'DayFlow'
  s.homepage       = 'https://github.com/gokite227/DayFlow'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
