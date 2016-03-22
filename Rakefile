desc "Build"
task :default do
  puts 'transpiling...'
  `bundle exec opal --compile -g dare -g opal-jquery -g rails-assets-jquery lib/koala.rb > koala.js`
end
