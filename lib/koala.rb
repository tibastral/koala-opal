require 'jquery'
require 'opal'
require 'opal-jquery'
require 'dare'

class Toto < Dare::Window
  SPRITE_SIZE = 128
  WINDOW_X = 1024
  WINDOW_Y = 768

  def initialize
    super width: 1024, height: 768, border: true
    @background_sprite = Dare::Image.new('images/background.png')
    @koala_sprite = Dare::Image.new('images/koala.png')
    @enemy_sprite = Dare::Image.new('images/enemy.png')
    @flag_sprite = Dare::Image.new('images/flag.png')
    @flag = {x: WINDOW_X - SPRITE_SIZE, y: WINDOW_Y - SPRITE_SIZE}
    @music = Dare::Sound.new('musics/koala.wav')
    @font = Dare::Font.new(font: "Helvetica", size: 20, color: 'black')
    reset

    # @x = 0
  end

  def draw
    (0..8).each do |x|
      (0..8).each do |y|
        @background_sprite.draw(x * SPRITE_SIZE, y * SPRITE_SIZE)
      end
    end

    @koala_sprite.draw(@player[:x], @player[:y])
    @enemies.each do |enemy|
      @enemy_sprite.draw(enemy[:x], enemy[:y])
    end
    @flag_sprite.draw(@flag[:x], @flag[:y])
    @font.draw("Level #{@enemies.length}", WINDOW_X - 100, 10)
  end

  def update
    @player[:x] += @speed if button_down?(Dare::KbRight)
    @player[:x] -= @speed if button_down?(Dare::KbLeft)
    @player[:y] += @speed if button_down?(Dare::KbDown)
    @player[:y] -= @speed if button_down?(Dare::KbUp)
    @player[:x] = normalize(@player[:x], WINDOW_X - SPRITE_SIZE)
    @player[:y] = normalize(@player[:y], WINDOW_Y - SPRITE_SIZE)
    handle_enemies
    # handle_quit
    if winning?
      reinit
    end
    if loosing?
      reset
    end
  end

  private

  def reset
    @enemies = []
    @speed = 3
    # @music.stop
    @music.play
    reinit
  end

  def reinit
    @speed += 1
    @player = {x: 0, y: 0}
    @enemies.push({x: 500 + rand(100), y: 200 + rand(300)})
  end

  def collision?(a, b)
    (a[:x] - b[:x]).abs < SPRITE_SIZE / 2 &&
    (a[:y] - b[:y]).abs < SPRITE_SIZE / 2
  end

  def loosing?
    @enemies.any? do |enemy|
      collision?(@player, enemy)
    end
  end

  def winning?
    collision?(@player, @flag)
  end

  def random_mouvement
    (rand(3) - 1)
  end

  def normalize(v, max)
    if v < 0
      0
    elsif v > max
      max
    else
      v
    end
  end

  def handle_quit
    if button_down? Dare::KbEscape
      close
    end
  end

  def handle_enemies
    @enemies = @enemies.map do |enemy|
      enemy[:timer] ||= 0
      if enemy[:timer] == 0
        enemy[:result_x] = random_mouvement
        enemy[:result_y] = random_mouvement
        enemy[:timer] = 50 + rand(50)
      end
      enemy[:timer] -= 1

      new_enemy = enemy.dup
      new_enemy[:x] += new_enemy[:result_x] * @speed
      new_enemy[:y] += new_enemy[:result_y] * @speed
      new_enemy[:x] = normalize(new_enemy[:x], WINDOW_X - SPRITE_SIZE)
      new_enemy[:y] = normalize(new_enemy[:y], WINDOW_Y - SPRITE_SIZE)
      unless collision?(new_enemy, @flag)
        enemy = new_enemy
      end
      enemy
    end
  end
end

Toto.new.run!
