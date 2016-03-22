# A sample Guardfile
# More info at https://github.com/guard/guard#readme

## Uncomment and set this to only include directories you want to watch
# directories %w(app lib config test spec features) \
#  .select{|d| Dir.exists?(d) ? d : UI.warning("Directory #{d} does not exist")}

## Note: if you are using the `directories` clause above and you are not
## watching the project directory ('.'), then you will want to move
## the Guardfile to a watched dir and symlink it back, e.g.
#
#  $ mkdir config
#  $ mv Guardfile config/
#  $ ln -s config/Guardfile .
#
# and, you'll have to watch "config/Guardfile" instead of "Guardfile"
class ::Guard::Opal < Plugin
  def mspec *paths
    command = ['bundle', 'exec', './bin/opal-mspec', *paths.flatten]
    result = time(:mspec, *paths) { system *command }
    notify 'MSpec', result
  end

  def rspec *paths
    command = ['bundle', 'exec', 'rspec', *paths.flatten]
    result = time(:rspec, *paths) { system *command }
    notify 'RSpec', result
  end

  def notify lib, result
    if result
      ::Guard::Notifier.notify(
        'Success ♥︎', title: "#{lib} results", image: :success, priority: 1
      )
    else
      ::Guard::Notifier.notify(
        'Failed ♠︎', title: "#{lib} results", image: :failed, priority: 1
      )
    end
  end

  def color *args
    Guard::UI.send :color, *args
  end

  def terminal_columns
    cols = `tput cols 2> /dev/tty`.strip.to_i
    ($?.success? && cols.nonzero?) ? cols : 80
  end

  def time *titles
    columns = terminal_columns
    puts color("=== running: #{titles.join(' ')} ".ljust(columns,'='), :cyan)
    s = Time.now
    result = yield
    t = (Time.now - s).to_f
    puts color("=== time: #{t} seconds ".ljust(columns, '='), :cyan)
    result
  end

  def run_on_changes(changes)
    time(:all) { system 'bundle', 'exec', 'rake' }
  end

  def run_all
    time(:all) { system 'bundle', 'exec', 'rake' }
  end
end

guard :opal do
  watch %r{^lib/.*}
end
